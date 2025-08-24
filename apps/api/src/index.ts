import express from "express";
import { authRouter } from "./routers/authRouter";
import { channelRouter } from "./routers/channelRouter";
import { videoRouter } from "./routers/videoRouter";
import { roomRouter } from "./routers/roomRouter";

const app = express();

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/channels", channelRouter);
app.use("/api/videos", videoRouter);
app.use("/api/rooms", roomRouter);

app.listen(3001, () => {
  console.log("the server has started on port 3001");
});
