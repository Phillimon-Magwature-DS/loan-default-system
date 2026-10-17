const { z } = require('zod');

const signupRequestSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  companyEmail: z.string().trim().email().max(200),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
});

const signupVerifySchema = signupRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

const forgotRequestSchema = z.object({
  email: z.string().trim().email(),
});

const forgotVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(128),
});

module.exports = {
  signupRequestSchema,
  signupVerifySchema,
  loginSchema,
  changePasswordSchema,
  forgotRequestSchema,
  forgotVerifySchema,
};