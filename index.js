import express from "express";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import { validate as isUUID } from "uuid";

const app = express();

/*
IMPORTANT: Twilio webhook parser
*/
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


/*
INIT SUPABASE
*/
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);


/*
INIT TWILIO
*/
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);


/*
HEALTH CHECK ROUTE
*/
app.get("/", (req, res) => {
  res.send("RMS Backend Running");
});


/*
START REVIEW FLOW
Creates customer + sends rating request
*/
app.post("/start-review", async (req, res) => {

  try {

    const { name, phone, client_id } = req.body;

    console.log("Start review payload:", req.body);

    if (!isUUID(client_id)) {
      return res.status(400).json({
        error: "Invalid client_id UUID"
      });
    }

    /*
    NORMALIZE PHONE BEFORE SAVING
    remove whatsapp: prefix if present
    */
    const cleanPhone = phone.replace("whatsapp:", "");

    /*
    INSERT CUSTOMER
    */
    const { data, error } = await supabase
      .from("customers")
      .insert([
        {
          name,
          phone: cleanPhone,
          client_id
        }
      ])
      .select()
      .single();

    if (error) {
      console.log("Supabase insert error:", error);
      return res.status(500).json(error);
    }

    /*
    SEND FIRST MESSAGE
    */
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${cleanPhone}`,
      body: "Hi! Please rate your experience from 1⭐ to 5⭐."
    });

    return res.json({
      success: true,
      customer: data
    });

  } catch (err) {

    console.log("Server error:", err);

    return res.status(500).json({
      error: "Internal server error"
    });

  }

});


/*
INCOMING WHATSAPP REPLIES WEBHOOK
*/
app.post("/incoming-message", async (req, res) => {

  try {

    console.log("Webhook received:", req.body);

    const incomingText = req.body.Body?.trim();

    /*
    REMOVE whatsapp: prefix
    */
    const senderPhone = req.body.From.replace("whatsapp:", "");

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
    FIND CUSTOMER
    */
    const { data: customer, error } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", senderPhone)
      .single();

    if (error || !customer) {

      console.log("Customer not found");

      return res.send("OK");

    }


    /*
    STORE RATING
    */
    await supabase
      .from("customers")
      .update({
        rating,
        last_contacted: new Date().toISOString()
      })
      .eq("id", customer.id);

    console.log("Rating saved");


    /*
    POSITIVE vs NEGATIVE FLOW
    */
    if (rating >= 4) {

      await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${senderPhone}`,
        body:
          "Thank you! Would you mind sharing this on Google?\n\n👉 https://g.page/r/YOUR_LINK/review"
      });

      console.log("Positive flow triggered");

    } else {

      await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${senderPhone}`,
        body:
          "We're sorry your experience wasn't perfect. Please tell us what went wrong so we can improve."
      });

      console.log("Negative flow triggered");

    }

    res.send("Reply processed");

  } catch (err) {

    console.log("Webhook error:", err);

    res.status(500).send("Webhook error");

  }

});


/*
START SERVER
*/
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
