const { z } = require('zod');

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  role: z.enum(['admin', 'user']),
});

const updateUserSchema = z
  .object({
    role: z.enum(['admin', 'user']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.role !== undefined || d.isActive !== undefined, {
    message: 'Provide role and/or isActive.',
  });

module.exports = { createUserSchema, updateUserSchema };