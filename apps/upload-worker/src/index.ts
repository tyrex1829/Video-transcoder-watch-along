import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import amqp, { ConsumeMessage } from "amqplib";
import dotenv from "dotenv";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import fs, { createWriteStream } from "fs-extra";

// Interface for video processing job
interface VideoJob {
  videoId: string;
  videoUrl: string;
  userId: string;
  videoTitle: string;
}

interface ProcessedVideo {
  outputPath: string;
  name: string;
  width: number;
  height: number;
  url: string;
}

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const QUEUE_NAME = "video-processing";

async function startConsumer() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
    });
    channel.prefetch(1);
    console.log("Connected to RabbitMQ, waiting for messages...");

    channel.consume(QUEUE_NAME, async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      let inputDir: string = "";
      let outputDir: string = "";

      try {
        const { videoId, videoUrl, userId, videoTitle }: VideoJob = JSON.parse(
          msg.content.toString()
        );
        console.log(`Processing video ${videoId} for user ${userId}`);

        // Parse S3 URL to extract bucket and key
        const url = new URL(videoUrl);
        const bucketName = url.hostname.split(".")[0];
        const key = url.pathname.slice(1);

        if (!bucketName || !key) {
          throw new Error(`Invalid S3 URL format: ${videoUrl}`);
        }

        inputDir = path.join(__dirname, "../input");
        outputDir = path.join(__dirname, "../output");
        await fs.ensureDir(inputDir);
        await fs.ensureDir(outputDir);

        const inputPath = path.join(inputDir, videoId);
        const writeStream = createWriteStream(inputPath);
        const getObjectCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        });

        const response = await s3.send(getObjectCommand);
        const body = response.Body;
        if (!body) {
          throw new Error("no body found in response from s3");
        }
        if (body) {
          await new Promise<void>((resolve, reject) => {
            const stream = body as unknown as NodeJS.ReadableStream;
            stream.pipe(writeStream);
            writeStream.on("finish", () => resolve());
            writeStream.on("error", reject);
          });
        }

        const qualities = [
          { name: "360p", width: 640, height: 360 },
          { name: "480p", width: 854, height: 480 },
          { name: "720p", width: 1280, height: 720 },
          { name: "1080p", width: 1920, height: 1080 },
        ];
        const processedVideos: ProcessedVideo[] = await Promise.all(
          qualities.map(async (quality) => {
            const outputPath = path.join(
              outputDir,
              `${videoId}-${quality.name}.mp4`
            );
            await new Promise<void>((resolve, reject) => {
              ffmpeg(inputPath)
                .size(`${quality.width}x${quality.height}`)
                .videoBitrate("1000k")
                .audioBitrate("128k")
                .save(outputPath)
                .on("end", () => resolve())
                .on("error", reject);
            });
            const uploadKey = `TranscodedUploads/${videoId}-${quality.name}.mp4`;
            const putObjectCommand = new PutObjectCommand({
              Bucket: bucketName,
              Key: uploadKey,
              Body: fs.createReadStream(outputPath),
            });
            await s3.send(putObjectCommand);
            return {
              outputPath,
              ...quality,
              url: `https://${bucketName}.s3.amazonaws.com/${uploadKey}`,
            };
          })
        );
        // Clean up temporary files
        await fs.remove(inputDir);
        await fs.remove(outputDir);

        console.log(
          `Successfully processed video ${videoId}:`,
          processedVideos
        );

        // Acknowledge successful processing
        channel.ack(msg);

        return { success: true, processedVideos };
      } catch (error) {
        console.error("Error processing video:", error);

        // Clean up temporary files in case of error
        try {
          if (inputDir) await fs.remove(inputDir);
          if (outputDir) await fs.remove(outputDir);
        } catch (cleanupError) {
          console.error("Error cleaning up files:", cleanupError);
        }

        // Reject message and requeue it
        channel.nack(msg, false, true);
      }
    });
  } catch (error) {
    console.error("Failed to connect to RabbitMQ", error);
    setTimeout(() => startConsumer(), 5000);
  }
}

startConsumer();
