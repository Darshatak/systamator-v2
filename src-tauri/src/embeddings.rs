// Embeddings — fastembed singleton + cosine similarity.
//
// Used by skill recall in orchestrator.rs. First call downloads the
// AllMiniLMl6V2 model (~90 MB) into .fastembed_cache/; subsequent calls
// are essentially free (ONNX inference on CPU, ~5ms per short text).

use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use once_cell::sync::OnceCell;
use std::sync::Mutex;

static MODEL: OnceCell<Mutex<TextEmbedding>> = OnceCell::new();

fn model() -> Result<&'static Mutex<TextEmbedding>, String> {
    MODEL.get_or_try_init(|| {
        let opts = InitOptions::new(EmbeddingModel::AllMiniLML6V2Q);
        let m = TextEmbedding::try_new(opts).map_err(|e| format!("fastembed init: {e}"))?;
        Ok::<_, String>(Mutex::new(m))
    })
}

/// Embed a single string. Returns a normalised 384-dim vector.
pub fn embed_text(text: &str) -> Result<Vec<f32>, String> {
    let m = model()?;
    let mut guard = m.lock().map_err(|_| "embed mutex poisoned")?;
    let mut out = guard.embed(vec![text.to_string()], None).map_err(|e| format!("embed: {e}"))?;
    out.pop().ok_or("embed: no result".into())
}

/// Cosine similarity between two vectors in [0, 1] (we only use non-
/// negative embeddings). Safe on length mismatch — returns 0.
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() { return 0.0; }
    let mut dot = 0.0f32;
    let mut na  = 0.0f32;
    let mut nb  = 0.0f32;
    for (x, y) in a.iter().zip(b) {
        dot += x * y;
        na  += x * x;
        nb  += y * y;
    }
    if na == 0.0 || nb == 0.0 { 0.0 } else { dot / (na.sqrt() * nb.sqrt()) }
}
