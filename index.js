import express from "express";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/*
ENV VARIABLES REQUIRED IN RAILWAY
--------------------------------
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_NUMBER
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);


/*
HEALTH CHECK
*/
app.get("/", (req, res) => {
  res.send("RMS Backend Running 🚀");
});


/*
START REVIEW FLOW
Creates session + sends rating message
*/
app.post("/start-review", async (req, res) => {

  try {

    const { name, phone, client_id } = req.body;

    if (!name || !phone || !client_id) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    console.log("Creating customer:", { name, phone, client_id });

    /*
    INSERT CUSTOMER SESSION
    */
    const { data: customer, error } = await supabase
      .from("customers")
      .insert([{ name, phone, client_id }])
      .select()
      .single();

    if (error) {

      console.log("Supabase insert error:", error);

      return res.status(500).json({
        error: "Customer insert failed",
        details: error.message
      });
    }

    console.log("Customer created:", customer.id);


    /*
    SEND WHATSAPP MESSAGE
    */
    try {

      await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: phone,
        body: "Hi! Please rate your experience from 1 ⭐ to 5 ⭐"
      });

    } catch (twilioError) {

      console.log("Twilio send error:", twilioError);

      return res.status(500).json({
        error: "Customer saved but WhatsApp send failed",
        details: twilioError.message
      });

    }

    res.json({
      success: true,
      customer
    });

  } catch (err) {

    console.log("Unexpected start-review error:", err);

    res.status(500).json({
      error: "Internal server error"
    });

  }

});


/*
INCOMING WHATSAPP REPLY WEBHOOK
Handles rating responses
*/
app.post("/incoming-message", async (req, res) => {

  try {

    console.log("Webhook received:", req.body);

    const incomingText = req.body.Body?.trim();
    const senderPhone = req.body.From; 
    // IMPORTANT: keep whatsapp:+ format exactly

    if (!incomingText || !senderPhone) {
      return res.send("OK");
    }


    /*
    EXTRACT RATING
    */
    const ratingMatch = incomingText.match(/[1-5]/);

    if (!ratingMatch) {
      return res.send("Thanks for your response!");
    }

    const rating = parseInt(ratingMatch[0]);

    console.log("Rating detected:", rating);


    /*
    FIND MOST RECENT SESSION
    */
    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", senderPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!customer) {

      console.log("Customer not found for:", senderPhone);

      return res.send("OK");
    }


    /*
    SAVE RATING
    */
    const { error: updateError } = await supabase
      .from("customers")
      .update({
        rating,
        last_contacted: new Date().toISOString()
      })
      .eq("id", customer.id);

    if (updateError) {

      console.log("Rating update error:", updateError);

      return res.send("OK");
    }

    console.log("Rating stored");


    /*
    GET REVIEW LINK
    */
    const { data: client } = await supabase
      .from("clients")
      .select("review_link")
      .eq("id", customer.client_id)
      .single();


    /*
    RMS RESPONSE LOGIC
    */
    if (rating <= 3) {

      await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: senderPhone,
        body:
          "We're sorry your experience wasn't perfect. Please tell us what went wrong so we can fix it."
      });

      console.log("Complaint flow sent");

    } else {

      await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: senderPhone,
        body:
          `Thank you for your feedback! We'd really appreciate a Google review ⭐\n\n${client.review_link}`
      });

      console.log("Review link sent");

    }

    res.send("Reply processed");

  } catch (err) {

    console.log("Webhook error:", err);

    res.status(500).send("Webhook error");

  }

});


/*
SERVER START
*/
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});
