import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({ origin: process.env.DASHBOARD_ORIGIN ?? "http://localhost:5173" });

  // ── Swagger / OpenAPI ────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle("BSSS — PFF-TRUST API")
    .setDescription(
      "Triple-Gate Biometric Verification System: enrollment, transaction confirmation, " +
      "unbanked NIBSS onboarding, TCP terminal control, execution layer, and admin APIs.",
    )
    .setVersion("1.0")
    .addTag("identity",   "Triple-Gate biometric enrollment & transaction confirmation")
    .addTag("unbanked",   "Full-spectrum enrollment, NIBSS push, bankability lifecycle")
    .addTag("execution",  "Accounts, transfers, withdrawals, bill payments")
    .addTag("tcp",        "POS terminal binding, heartbeat, PulseSync")
    .addTag("admin",      "Liquidity, sentinel alerts, verification logs, system health")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
  // ────────────────────────────────────────────────────────────────────────

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`BSSS API listening on ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
