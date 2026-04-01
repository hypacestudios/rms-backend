require("dotenv").config();

const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const app = express();
app.use(express.json());


// CONNECT SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);


// HEALTH CHECK ROUTE
app.get("/", (req, res) => {
  res.send("RMS Backend Running");
});


// SEND WHATSAPP MESSAGE FUNCTION
async function sendWhatsAppMessage(to, message) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;

  return axios.post(
    url,
    new URLSearchParams({
      From: process.env.TWILIO_WHATSAPP_NUMBER,
      To: to,
      Body: message
    }),
    {
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN
      }
    }
  );
}


// CREATE CUSTOMER + SEND FIRST MESSAGE
app.post("/new-customer", async (req, res) => {
  try {

    const { name, phone, client_id } = req.body;

    // INSERT INTO DATABASE
    const { data, error } = await supabase
      .from("customers")
      .insert([{ name, phone, client_id }])
      .select()
      .single();

    if (error) throw error;


    // SEND WHATSAPP MESSAGE
    await sendWhatsAppMessage(
      phone,
      "Hi! Thank you for visiting us. Please rate your experience from 1 to 5."
    );


    res.json({
      success: true,
      customer: data
    });

  } catch (err) {

    console.log("ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false
    });

  }
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
