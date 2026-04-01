require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

/*
==============================
SUPABASE CONNECTION
==============================
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);


/*
==============================
HEALTH CHECK ROUTE
==============================
*/

app.get("/", (req, res) => {
  res.send("RMS Backend Running");
});


/*
==============================
SEND WHATSAPP MESSAGE FUNCTION
(TWILIO SANDBOX COMPATIBLE)
==============================
*/

async function sendWhatsAppMessage(to, message) {
  try {

    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
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

    return response.data;

  } catch (error) {

    console.log(
      "TWILIO ERROR:",
      error.response?.data || error.message
    );

    throw error;
  }
}


/*
==============================
CREATE CUSTOMER + SEND REVIEW MESSAGE
==============================
*/

app.post("/new-customer", async (req, res) => {
  try {

    let { name, phone, client_id } = req.body;

    if (!client_id) {
      throw new Error("client_id missing");
    }

    // Clean UUID input
    client_id = client_id.trim();

    /*
    INSERT CUSTOMER INTO DATABASE
    */

    const { data, error } = await supabase
      .from("customers")
      .insert([
        {
          name,
          phone,
          client_id
        }
      ])
      .select()
      .single();

    if (error) {
      console.log("SUPABASE ERROR:", error);
      throw error;
    }


    /*
    SEND FIRST REVIEW MESSAGE
    */

    await sendWhatsAppMessage(
      phone,
      "Hi! Thank you for visiting us. Please rate your experience from 1 to 5."
    );


    res.json({
      success: true,
      customer: data
    });

  } catch (err) {

    console.log(
      "SERVER ERROR:",
      err.response?.data || err.message
    );

    res.status(500).json({
      success: false
    });

  }
});


/*
==============================
SERVER START
==============================
*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
