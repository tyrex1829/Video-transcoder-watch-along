import express from "express";
import { authRouter } from "./routes/authRouter";
import { channelRouter } from "./routes/channelRouter";
import { videoRouter } from "./routes/videoRouter";

const app = express();

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/channels", channelRouter);
app.use("/api/videos", videoRouter);

app.listen(3001, () => {
  console.log("the server has started on port 3001");
});
