import { Router } from "express";
import { SignupSchema, LoginSchema } from "../types";
import jwt from "jsonwebtoken";
export const authRouter: Router = Router();
import client from "@repo/db";
import { userMiddleware } from "../middleware/userMiddleWare";
import bcryptjs from "bcryptjs";
import { JWT_SECRET } from "../config";

authRouter.post("/signup", async (req: any, res: any) => {
  try {
    const { email, password, username } = req.body;
    const parsedData = SignupSchema.safeParse(req.body);
    if (!parsedData.success) {
      return res.status(400).json({
        message: "Validation errors",
      });
    }
    const user = await client.user.findUnique({
      where: {
        email,
      },
    });
    if (user) {
      return res.status(409).json({
        message: "Username or email already exists",
      });
    }
    const hashedPassword = await bcryptjs.hash(password, 10);
    await client.user.create({
      data: {
        email,
        password: hashedPassword,
        username,
      },
    });
    return res.status(201).json({
      message: "User successfully registered",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

authRouter.post("/login", async (req: any, res: any) => {
  try {
    const { email, password } = req.body;
    const paresedData = LoginSchema.safeParse(req.body);
    if (!paresedData.success) {
      return res.status(400).json({
        message: "Validation errors",
      });
    }
    const user = await client.user.findUnique({
      where: {
        email,
      },
    });
    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }
    const isPasswordValid = await bcryptjs.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET
    );
    res.cookie("Authentication", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });
    return res.status(200).json({
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});
