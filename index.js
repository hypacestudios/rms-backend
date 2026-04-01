import express from "express";
import pkg from "@supabase/supabase-js";
import twilio from "twilio";
import { validate as isUUID } from "uuid";

const { createClient } = pkg;

const app = express();

/*
CRITICAL FIX:
force JSON parsing explicitly
*/
app.use(express.json({ strict: true }));

/*
ENV VARIABLES
*/
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/*
HEALTH CHECK
*/
app.get("/", (req, res) => {
  res.send("RMS Backend Running");
});

/*
CREATE CUSTOMER
*/
app.post("/new-customer", async (req, res) => {
  try {
    console.log("Incoming payload:", req.body);

    let { name, phone, client_id } = req.body;

    /*
    CLEAN INPUT
    */
    client_id = String(client_id).trim();

    /*
    VALIDATE UUID FORMAT
    */
    if (!isUUID(client_id)) {
      return res.status(400).json({
        error: "Invalid UUID format",
        received: client_id
      });
    }

    /*
    INSERT CUSTOMER
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
      console.error("Supabase insert error:", error);
      return res.status(500).json(error);
    }

    /*
    SEND WHATSAPP MESSAGE
    */
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: phone,
      body:
        "Hi! We'd love your feedback.\nPlease rate us:\n1⭐ 2⭐ 3⭐ 4⭐ 5⭐"
    });

    return res.json({
      success: true,
      customer: data
    });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message
    });
  }
});

/*
START SERVER
*/
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
