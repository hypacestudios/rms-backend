import express from "express";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

const app = express();

/*
BODY PARSERS (REQUIRED FOR TWILIO WEBHOOK)
*/
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/*
ENV VARIABLES
*/
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER
} = process.env;

/*
VERIFY ENV VARIABLES EXIST
*/
console.log("SUPABASE KEY PRESENT:", !!SUPABASE_SERVICE_ROLE_KEY);
console.log("SUPABASE URL:", SUPABASE_URL);

/*
SUPABASE CLIENT
*/
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

/*
TWILIO CLIENT
*/
const twilioClient = twilio(
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN
);

/*
HEALTH CHECK
*/
app.get("/", (req, res) => {
  res.send("RMS Backend Running 🚀");
});


/*
SUPABASE DEBUG ROUTE
VERY IMPORTANT — tells us if Railway can reach Supabase
*/
app.get("/debug-supabase", async (req, res) => {
  try {

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .limit(1);

    if (error) {
      return res.json({
        status: "supabase_error",
        error
      });
    }

    res.json({
      status: "success",
      data
    });

  } catch (err) {

    res.json({
      status: "network_failure",
      error: err.message
    });

  }
});


/*
START REVIEW FLOW
Creates customer and sends rating request
*/
app.post("/start-review", async (req, res) => {

  try {

    const { name, phone, client_id } = req.body;

    if (!name || !phone || !client_id) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    /*
    INSERT CUSTOMER
    IMPORTANT COLUMN NAME: phone_number
    */
    const { data: customer, error } = await supabase
      .from("customers")
      .insert([
        {
          name,
          phone_number: phone,
          client_id
        }
      ])
      .select()
      .single();

    if (error) {

      console.log("SUPABASE INSERT ERROR:", error);

      return res.status(500).json({
        error: "Customer insert failed",
        details: error.message
      });
    }

    console.log("Customer created:", customer.id);

    /*
    SEND RATING MESSAGE
    */
    await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: phone,
      body: "Hi! Please rate your experience from 1 ⭐ to 5 ⭐"
    });

    res.json({
      success: true,
      customer
    });

  } catch (err) {

    console.log("START REVIEW ERROR:", err);

    res.status(500).json({
      error: "Internal server error",
      details: err.message
    });

  }

});


/*
INCOMING WHATSAPP WEBHOOK
Handles rating replies
*/
app.post("/whatsapp-webhook", async (req, res) => {

  try {

    console.log("Incoming message:", req.body);

    const incomingMsg = req.body.Body?.trim();
    const from = req.body.From;

    if (!incomingMsg) {
      return res.sendStatus(200);
    }

    /*
    CHECK IF MESSAGE IS RATING
    */
    if (["1", "2", "3", "4", "5"].includes(incomingMsg)) {

      console.log("Rating detected:", incomingMsg);

      /*
      FIND CUSTOMER BY PHONE
      */
      const { data: customer, error } = await supabase
        .from("customers")
        .select("*")
        .eq("phone_number", from)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !customer) {

        console.log("Customer not found");

        return res.sendStatus(200);
      }

      const rating = parseInt(incomingMsg);

      /*
      SAVE RATING
      */
      await supabase
        .from("ratings")
        .insert([
          {
            customer_id: customer.id,
            rating
          }
        ]);

      /*
      BAD REVIEW FLOW
      */
      if (rating <= 3) {

        await twilioClient.messages.create({
          from: TWILIO_WHATSAPP_NUMBER,
          to: from,
          body:
            "We're sorry your experience wasn’t great. Please tell us what went wrong so we can improve."
        });

      }

      /*
      GOOD REVIEW FLOW
      */
      else {

        await twilioClient.messages.create({
          from: TWILIO_WHATSAPP_NUMBER,
          to: from,
          body:
            "Thank you! Would you mind sharing this on Google?\n👉 https://g.page/r/YOUR_LINK/review"
        });

      }

    }

    res.sendStatus(200);

  } catch (err) {

    console.log("WEBHOOK ERROR:", err);

    res.sendStatus(200);
  }

});


/*
SERVER START
*/
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});
