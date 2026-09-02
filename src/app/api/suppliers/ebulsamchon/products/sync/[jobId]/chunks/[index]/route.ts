import { NextResponse } from "next/server";
import {
  createZicgamSignedUpload,
  isZicgamJobId,
  verifyZicgamUploadToken,
} from "@/modules/suppliers/zicgam/zicgam-batch-storage";

export async function POST(
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
          message: "이불삼촌 업로드 권한이 올바르지 않습니다.",
        },
      },
      { status: 401 },
    );
  }
  const signedUpload = await createZicgamSignedUpload(jobId, index);
  return NextResponse.json({ success: true, index, ...signedUpload });
}
