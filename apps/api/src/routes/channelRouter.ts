import { Router } from "express";
import client from "@repo/db";
import { userMiddleware } from "../middleware/userMiddleWare";
import { ChannelSchema } from "../types";
export const channelRouter: Router = Router();

channelRouter.get("/", userMiddleware, async (req: any, res: any) => {
  try {
    const parsedData = ChannelSchema.safeParse(req.body);
    if (!parsedData.success) {
      return res.status(400).json({
        message: "Validation errors",
      });
    }
    const channel = await client.channel.findUnique({
      where: {
        userId: req.user.id,
      },
    });
    if (channel) {
      return res.status(409).json({
        message: "Channel already exists",
      });
    }
    const newchannel = await client.channel.create({
      data: {
        name: parsedData.data.name,
        description: parsedData.data.description,
        slug: parsedData.data.slug,
        userId: req.user.id,
      },
    });

    return res.status(200).json({
      message: "Channel created successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

channelRouter.get("/:slug", userMiddleware, async (req: any, res: any) => {
  try {
    const { slug } = req.params;
    const channel = await client.channel.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        description: true,
        subscriber_count: true,
        videos: {
          select: {
            id: true,
            title: true,
            thumbnail_url: true,
          },
        },
      },
    });
    if (!channel) {
      return res.status(400).json({
        message: "Channel not found",
      });
    }
    return res.status(200).json({
      channel,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});
