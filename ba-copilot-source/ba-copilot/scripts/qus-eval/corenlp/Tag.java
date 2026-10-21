// Gán nhãn từ loại bằng Stanford CoreNLP (MaxentTagger, mô hình mặc định english-left3words-distsim) cho thí nghiệm so sánh
// bộ gán nhãn của AQUSA. Đọc stdin mỗi dòng một chuỗi, in mỗi dòng: token<TAB>token…<SEP>tag<TAB>tag… (Penn Treebank).
import edu.stanford.nlp.ling.HasWord;
import edu.stanford.nlp.ling.TaggedWord;
import edu.stanford.nlp.tagger.maxent.MaxentTagger;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Tag {
  public static void main(String[] a) throws Exception {
    MaxentTagger t = new MaxentTagger("edu/stanford/nlp/models/pos-tagger/english-left3words-distsim.tagger");
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    PrintStream out = new PrintStream(System.out, true, "UTF-8");
    String line;
    while ((line = in.readLine()) != null) {
      List<String> w = new ArrayList<>(), p = new ArrayList<>();
      for (List<HasWord> s : MaxentTagger.tokenizeText(new StringReader(line)))
        for (TaggedWord tw : t.tagSentence(s)) { w.add(tw.word()); p.add(tw.tag()); }
      out.println(String.join("\t", w) + "\u0001" + String.join("\t", p));
    }
  }
}
