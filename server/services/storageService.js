export async function requestVideoUpload({ alunoId, contentType, size }) {
  if (
    !["video/mp4", "video/webm", "video/quicktime"].includes(contentType) ||
    !Number.isInteger(size) ||
    size <= 0 ||
    size > 100 * 1024 * 1024
  )
    throw Object.assign(new Error("Vídeo inválido ou maior que 100 MB."), {
      status: 400,
    });
  if (!process.env.STORAGE_SIGN_URL || !process.env.STORAGE_API_KEY)
    throw Object.assign(
      new Error(
        "Armazenamento de vídeos não configurado. Envie um link pelo histórico."
      ),
      { status: 503 }
    );
  const r = await fetch(process.env.STORAGE_SIGN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.STORAGE_API_KEY}`,
    },
    body: JSON.stringify({ owner: alunoId, contentType, size }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok)
    throw Object.assign(new Error("Falha ao preparar upload."), {
      status: 502,
    });
  const data = await r.json();
  if (
    !data.uploadUrl?.startsWith("https://") ||
    !data.videoUrl?.startsWith("https://")
  )
    throw new Error("Resposta inválida do armazenamento.");
  return {
    upload_url: data.uploadUrl,
    video_url: data.videoUrl,
    mode: "provider",
  };
}
