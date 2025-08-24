import { z } from "zod";
export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const ChannelSchema = z.object({
  name: z.string(),
  description: z.string(),
  slug: z.string(),
  userId: z.string(),
});

export const VideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  videoUrl: z.string(),
  thumbnailUrl: z.string(),
  channelId: z.string(),
  videoKey: z.string(),
});
