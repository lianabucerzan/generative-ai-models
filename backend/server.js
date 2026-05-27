import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You generate Vue 3 Single File Components using Tailwind CSS. Return only code.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    res.json({
      output: response.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Generation failed",
    });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});