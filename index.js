require("dotenv").config();

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// health check route
app.get("/", (req, res) => {
  res.send("RMS Backend Running");
});

// insert customer route
app.post("/new-customer", async (req, res) => {
  try {
    const { name, phone, client_id } = req.body;

    const { data, error } = await supabase
      .from("customers")
      .insert([{ name, phone, client_id }])
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      customer: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Insert failed"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
