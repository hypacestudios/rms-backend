import express from "express";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import { validate as isUUID } from "uuid";

const app = express();

app.use(express.json());

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
START REVIEW FLOW
*/
app.post("/start-review", async (req, res) => {
  try {
    console.log("Incoming payload:", req.body);

    let { name, phone, client_id } = req.body;

    client_id = String(client_id).trim();

    if (!isUUID(client_id)) {
      return res.status(400).json({
        error: "Invalid UUID format",
        received: client_id
      });
    }

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

    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: phone,
      body: "Hi! We'd love your feedback.\nPlease rate us from 1⭐ to 5⭐."
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
SERVER START
*/
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
