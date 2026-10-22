// Bundle riêng public/nlp.js: mô hình wink-nlp cho bộ chấm QUS (AQUSA), tải khi mở màn cần chấm QUS.
import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

(globalThis as { __winkNlp?: unknown }).__winkNlp = winkNLP(model);
window.dispatchEvent(new Event("aqusa-ready"));
