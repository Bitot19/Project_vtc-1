import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import userRoutes from "./routes/user.js"; // chứa route /me
import productRoutes from "./routes/product.js";
import categoryRoutes from "./routes/category.js";



dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// health check
app.get("/", (_req, res) => res.json({ ok: true }));

// chỉ đăng ký
app.use("/api/user", userRoutes);   // /me
app.use("/api/products", productRoutes);
app.use("/api/category", categoryRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
