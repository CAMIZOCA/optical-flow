import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Capture = {
  id: string;
  state: "pending" | "ready" | "failed" | "approved";
  raw_text: string;
  reviewed_text: string;
  patient_reference: string;
  created_at: string;
  image_url: string;
};

const apiUrl = "/api/captures/";
const statusNames: Record<Capture["state"], string> = {
  pending: "Pendiente",
  ready: "Para revisar",
  failed: "OCR fallido",
  approved: "Aprobada",
};

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.method === "POST") {
    const csrfToken = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("csrftoken="))
      ?.slice("csrftoken=".length);
    if (!csrfToken) throw new Error("Recarga la página para iniciar la sesión de la demo.");
    headers.set("X-CSRFToken", decodeURIComponent(csrfToken));
  }

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.error ?? "No se pudo completar la operación.");
  }
  return data as T;
}

function App() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reference, setReference] = useState("");
  const [reviewedText, setReviewedText] = useState("");
  const [busy, setBusy] = useState("Cargando capturas…");
  const [problem, setProblem] = useState("");
  const selected = captures.find((capture) => capture.id === selectedId);

  function select(capture: Capture) {
    setSelectedId(capture.id);
    setReference(capture.patient_reference);
    setReviewedText(capture.reviewed_text || capture.raw_text);
  }

  function remember(capture: Capture) {
    setCaptures((current) => {
      if (current.some((item) => item.id === capture.id)) {
        return current.map((item) => item.id === capture.id ? capture : item);
      }
      return [capture, ...current];
    });
    select(capture);
  }

  useEffect(() => {
    api<{ captures: Capture[] }>(apiUrl)
      .then(({ captures: initial }) => {
        setCaptures(initial);
        if (initial[0]) select(initial[0]);
      })
      .catch((error: Error) => setProblem(error.message))
      .finally(() => setBusy(""));
  }, []);

  async function perform(label: string, action: () => Promise<void>) {
    setBusy(label);
    setProblem("");
    try {
      await action();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Ocurrió un error.");
    } finally {
      setBusy("");
    }
  }

  async function extract(capture: Capture) {
    const result = await api<Capture>(apiUrl + capture.id + "/ocr/", { method: "POST" });
    remember(result);
    if (result.state === "failed") setProblem("El OCR no pudo leer la imagen. Puedes reintentar.");
  }

  async function upload(file: Blob, filename: string) {
    const body = new FormData();
    body.append("image", file, filename);
    const capture = await api<Capture>(apiUrl, { method: "POST", body });
    remember(capture);
    setBusy("Extrayendo texto…");
    await extract(capture);
  }

  function openExample() {
    void perform("Cargando ejemplo…", async () => {
      const response = await fetch("/sample.png");
      if (!response.ok) throw new Error("El ejemplo no está disponible.");
      await upload(await response.blob(), "sample.png");
    });
  }

  function approve(event: FormEvent<HTMLFormElement>, capture: Capture) {
    event.preventDefault();
    void perform("Guardando revisión…", async () => {
      const approved = await api<Capture>(apiUrl + capture.id + "/approve/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_reference: reference, reviewed_text: reviewedText }),
      });
      remember(approved);
    });
  }

  return (
    <>
      <header className="brand">
        <div className="brand-icon" aria-hidden="true">OF</div>
        <div><strong>Optical Flow</strong><span>Digitalización de expedientes</span></div>
      </header>
      <main>
        <section className="intro">
          <div>
            <h1>Capturas y revisión</h1>
            <p>Demo de portafolio. Usa imágenes y referencias ficticias.</p>
          </div>
          <div className="actions">
            <button type="button" onClick={openExample} disabled={!!busy}>Probar con un ejemplo</button>
            <label className={"button primary" + (busy ? " disabled" : "")}>
              Subir imagen
              <input type="file" accept="image/jpeg,image/png" disabled={!!busy} onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void perform("Subiendo imagen…", () => upload(file, file.name));
              }} />
            </label>
          </div>
        </section>
        {busy && <p className="notice" role="status">{busy}</p>}
        {problem && <p className="notice error" role="alert">{problem}</p>}
        <div className="workspace">
          <aside aria-label="Capturas" className="card">
            <h2>Capturas recientes</h2>
            {captures.length === 0 && <p className="muted">Aún no hay capturas.</p>}
            {captures.map((capture) => (
              <button key={capture.id} type="button" className="capture-item"
                disabled={!!busy} aria-pressed={selectedId === capture.id} onClick={() => select(capture)}>
                <span><strong>{capture.patient_reference || "Captura " + capture.id.slice(0, 8)}</strong>
                  <small>{new Date(capture.created_at).toLocaleString("es-EC")}</small></span>
                <span className={"status " + capture.state}>{statusNames[capture.state]}</span>
              </button>
            ))}
          </aside>
          <section className="card detail" aria-label="Detalle de captura">
            {!selected ? (
              <div className="empty"><h2>Selecciona o sube una imagen</h2><p>Los archivos JPEG y PNG pueden tener hasta 8 MB.</p></div>
            ) : (
              <>
                <h2>Revisión de captura</h2>
                <div className="review">
                  <figure>
                    <figcaption>Imagen original</figcaption>
                    <img src={selected.image_url} alt="Documento original de la captura seleccionada" />
                  </figure>
                  {selected.state === "approved" ? (
                    <div className="editor">
                      <h3>Revisión aprobada</h3>
                      <p>Referencia: <strong>{selected.patient_reference}</strong></p>
                      <div className="transcript">{selected.reviewed_text}</div>
                      <a className="button primary" href={selected.image_url + "?download=1"}>Descargar original</a>
                    </div>
                  ) : selected.state === "ready" ? (
                    <form className="editor" onSubmit={(event) => approve(event, selected)}>
                      <label>Referencia ficticia del paciente
                        <input value={reference} onChange={(event) => setReference(event.target.value)}
                          maxLength={80} placeholder="DEMO-001" required disabled={!!busy} />
                      </label>
                      <label>Texto revisado
                        <textarea value={reviewedText} onChange={(event) => setReviewedText(event.target.value)}
                          maxLength={20000} rows={9} required disabled={!!busy} />
                      </label>
                      <button className="primary" type="submit" disabled={!!busy}>Aprobar captura</button>
                    </form>
                  ) : (
                    <div className="editor">
                      <p>{statusNames[selected.state]}</p>
                      <button className="primary" type="button" disabled={!!busy}
                        onClick={() => void perform("Extrayendo texto…", () => extract(selected))}>Ejecutar OCR</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(<App />);
