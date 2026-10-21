// Nạp mô hình wink-nlp cho bộ chấm AQUSA phía server / script / test (không dùng ở client – xem client/useAqusa.ts).
import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";
import { setNlp } from "./aqusa.ts";

setNlp(winkNLP(model));
