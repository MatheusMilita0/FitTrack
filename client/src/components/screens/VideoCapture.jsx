import { useEffect, useRef, useState } from "react";
export function VideoCapture({ file, onFile, error }) {
  const camera = useRef(null),
    recorder = useRef(null),
    stream = useRef(null),
    chunks = useRef([]),
    mounted = useRef(true),
    [recording, setRecording] = useState(false),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState("");
  useEffect(() => {
    if (recording && camera.current) camera.current.srcObject = stream.current;
  }, [recording]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      recorder.current?.state === "recording" && recorder.current.stop();
      stream.current?.getTracks().forEach(t => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const choose = f => {
    if (!f) return;
    if (
      !["video/mp4", "video/webm", "video/quicktime"].includes(f.type) ||
      f.size > 100 * 1024 * 1024 ||
      f.size === 0
    ) {
      setMessage("Selecione MP4, WebM ou MOV com até 100 MB.");
      return;
    }
    setMessage("");
    onFile(f);
  };
  const start = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "A gravação não está disponível neste navegador. Use “Selecionar arquivo”."
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (!mounted.current) {
        stream.current.getTracks().forEach(t => t.stop());
        return;
      }
      chunks.current = [];
      recorder.current = new MediaRecorder(stream.current);
      let size = 0;
      recorder.current.ondataavailable = e => {
        if (e.data.size) {
          chunks.current.push(e.data);
          size += e.data.size;
          if (size > 95 * 1024 * 1024 && recorder.current.state === "recording")
            recorder.current.stop();
        }
      };
      recorder.current.onstop = () => {
        stream.current.getTracks().forEach(t => t.stop());
        if (mounted.current) {
          setRecording(false);
          const type = recorder.current.mimeType.split(";")[0] || "video/webm";
          choose(
            new File(
              chunks.current,
              type === "video/mp4" ? "execucao.mp4" : "execucao.webm",
              { type }
            )
          );
        }
      };
      recorder.current.start(1000);
      setRecording(true);
      setMessage("Gravando. Pare ao terminar a execução.");
    } catch (e) {
      stream.current?.getTracks().forEach(t => t.stop());
      setMessage(e.message || "Não foi possível acessar a câmera.");
    }
  };
  return (
    <div className="chart-card">
      <label>
        Vídeo da execução (até 100 MB)
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          capture="environment"
          onChange={e => choose(e.target.files?.[0])}
        />
      </label>
      <button type="button" disabled={recording} onClick={start}>
        Gravar com a câmera
      </button>
      {recording && (
        <>
          <video
            ref={camera}
            autoPlay
            muted
            playsInline
            style={{ width: "100%", maxHeight: 300 }}
          />
          <button type="button" onClick={() => recorder.current.stop()}>
            Parar gravação
          </button>
        </>
      )}
      {file && (
        <>
          <p>
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
          <button type="button" onClick={() => onFile(null)}>
            Remover arquivo
          </button>
        </>
      )}
      {preview && (
        <video
          controls
          src={preview}
          preload="metadata"
          style={{ width: "100%", maxHeight: 300 }}
        />
      )}
      <p role="status">{message || error}</p>
    </div>
  );
}
export function FeedbackVideo({ url }) {
  const [failed, setFailed] = useState(false);
  if (!/^https?:\/\//i.test(url || "")) return null;
  return (
    <>
      {!failed && /^https:\/\//i.test(url) && (
        <video
          controls
          preload="none"
          src={url}
          onError={() => setFailed(true)}
          style={{ width: "100%", maxHeight: 360 }}
        />
      )}
      {failed && (
        <p>
          O provedor não permite reproduzir este link aqui. Abra o vídeo no
          serviço de origem.
        </p>
      )}
      <a href={url} target="_blank" rel="noopener noreferrer">
        Abrir vídeo no serviço de origem
      </a>
    </>
  );
}
