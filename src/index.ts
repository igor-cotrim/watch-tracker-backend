import "dotenv/config";
import express from "express";
import cors from "cors";
import watchlistRoutes from "./routes/watchlist.js";
import mediaRoutes from "./routes/media.js";
import discoverRoutes from "./routes/discover.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/discover", discoverRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Global error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`WatchTracker API running on http://localhost:${PORT}`);
});

export default app;
