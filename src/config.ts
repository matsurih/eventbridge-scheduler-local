export const config = {
  port: parseInt(process.env.PORT ?? "8293", 10),
  dbPath: process.env.DB_PATH ?? ":memory:",
  sqsEndpoint: process.env.SCHEDULER_SQS_ENDPOINT ?? "http://localhost:4566",
  lambdaEndpoint: process.env.SCHEDULER_LAMBDA_ENDPOINT ?? "http://localhost:4566",
  isProduction: process.env.NODE_ENV === "production",
} as const;
