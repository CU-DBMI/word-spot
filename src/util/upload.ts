import { expose } from "comlink";
import { extractRawText } from "mammoth";
import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker?url";

/** https://github.com/mozilla/pdf.js/issues/10478#issuecomment-2242664642 */
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/** parse uploaded file as word document */
export const parseWordDoc = async (buffer: ArrayBuffer) =>
  (await extractRawText({ arrayBuffer: buffer })).value;

/** parse uploaded file as PDF */
export const parsePdf = async (buffer: ArrayBuffer) => {
  const pdf = await pdfjs.getDocument(buffer).promise;
  let text = "";
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++)
    text +=
      (await (await pdf.getPage(pageIndex)).getTextContent()).items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ") + "\n";
  return text;
};

expose({ parseWordDoc, parsePdf });
