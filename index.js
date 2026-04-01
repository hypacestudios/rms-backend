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
HEALTH CHECK
==============================
*/

app.get("/", (req, res) => {
  res.send("RMS Backend Running");
});


/*
==============================
SEND WHATSAPP MESSAGE
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

    console.log("WHATSAPP SENT:", response.data.sid);

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
CREATE CUSTOMER ROUTE
==============================
*/

app.post("/new-customer", async (req, res) => {

  try {

    let { name, phone, client_id } = req.body;

    console.log("REQUEST BODY:", req.body);


    /*
    STEP 1: VALIDATE CLIENT EXISTS
    */

    const { data: clientExists, error: clientError } =
      await supabase
        .from("clients")
        .select("id")
        .eq("id", client_id)
        .single();

    if (clientError || !clientExists) {

      console.log("CLIENT VALIDATION FAILED:", clientError);

      return res.status(400).json({
        success: false,
        message: "Invalid client_id"
      });
    }


    /*
    STEP 2: INSERT CUSTOMER
    */

    const { data, error } =
      await supabase
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

      console.log("SUPABASE INSERT ERROR:", error);

      return res.status(500).json({
        success: false,
        error
      });
    }


    /*
    STEP 3: SEND WHATSAPP MESSAGE
    */

    await sendWhatsAppMessage(
      phone,
      "Hi! Thank you for visiting us. Please rate your experience from 1 to 5."
    );


    return res.json({
      success: true,
      customer: data
    });

  }

  catch (err) {

    console.log("SERVER ERROR:", err);

    return res.status(500).json({
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
