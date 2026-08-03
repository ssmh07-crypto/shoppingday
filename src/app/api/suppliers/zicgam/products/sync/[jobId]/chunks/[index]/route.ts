import { NextResponse } from "next/server";
import {
  isZicgamJobId,
  uploadZicgamChunk,
  verifyZicgamUploadToken,
  ZICGAM_CHUNK_LIMIT,
} from "@/modules/suppliers/zicgam/zicgam-batch-storage";

export async function PUT(
  request: Request,
  context: { params: Promise<{ jobId: string; index: string }> },
) {
  const { jobId, index: rawIndex } = await context.params;
  const index = Number(rawIndex);
  if (
    !isZicgamJobId(jobId) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 1000
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "validation_error",
          message: "청크 주소가 올바르지 않습니다.",
        },
      },
      { status: 400 },
    );
  }
  const token = request.headers.get("x-zicgam-upload-token") ?? "";
  if (!(await verifyZicgamUploadToken(jobId, token))) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "invalid_upload_token",
          message: "직감 업로드 권한이 올바르지 않습니다.",
        },
      },
      { status: 401 },
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!contentLength || contentLength > ZICGAM_CHUNK_LIMIT || !request.body) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "payload_too_large",
          message: "직감 수집 청크 크기를 확인해 주세요.",
        },
      },
      { status: 413 },
    );
  }
  await uploadZicgamChunk(jobId, index, request.body);
  return NextResponse.json({ success: true, index });
}
