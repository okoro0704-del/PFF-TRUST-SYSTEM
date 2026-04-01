import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Step 3 — Liveness Challenge Response.
 *
 * The client submits the challengeId issued in Step 2 along with 1–5 base64-encoded
 * JPEG frames captured during the active liveness task.
 *
 * Anti-Replay Security Model:
 *   - challengeId is a UUID issued exactly once per challenge (single-use).
 *   - Server checks: consumed === false AND expiresAt > now() before accepting.
 *   - On first valid response: consumed → true, consumedAt → now().
 *   - A replayed challengeId (even with different frames) is rejected immediately.
 *   - Each session's challenge pool excludes previously issued types within the session.
 *
 * Zero-Knowledge Liveness Storage:
 *   - responseFramesB64 are processed in-memory by the CV engine ONLY.
 *   - NO video, NO frames, NO face embeddings are written to the database.
 *   - Only liveness_verified: TRUE (boolean) is persisted in BlideSession.
 *   - completedChallengeType (e.g. "BLINK_TWICE") is stored in the session for audit;
 *     this is the TASK TYPE only, NOT the response content.
 *
 * Production CV Engine:
 *   - MediaPipe FaceMesh validates active muscle movement across the frame sequence.
 *   - AWS Rekognition DetectFaces can additionally validate pose delta > threshold.
 *   - Stub implementation: validates frame is non-empty + challengeId is unconsumed.
 */
export class SubmitLivenessResponseDto {
  @ApiProperty({
    description:
      "UUID issued by the server in Step 2 (POST /:ref/select). " +
      "Single-use — replay of any previously consumed challengeId is rejected.",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsString()
  challengeId!: string;

  @ApiProperty({
    description:
      "1–5 base64-encoded JPEG frames captured during the liveness task. " +
      "Processed in-memory only — NEVER stored. Minimum 1 frame required.",
    type: [String],
    example: ["/9j/4AAQSk...", "/9j/4AAQSl..."],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  responseFramesB64!: string[];

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

