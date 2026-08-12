/* ============================================================
   GERADO POR tools/build-projects.js — não edite a lista de arquivos
   à mão; rode o script depois de mexer em assets/.

       node tools/build-projects.js

   Estes campos são seus, o script preserva:
     name  título da peça no leitor de metadados
     tag   linha de apoio (função, formato, cliente…)
     alt   descrição para leitor de tela — descreva o que se vê

   A ordem deste array é a ordem do carrossel.
   ============================================================ */

(function (root) {
  root.PROJECTS = [
    { file: "King Arthur.jpg", type: "image", w: 4961, h: 3508, name: "King Arthur", tag: "", alt: "" },
    { file: "knight.jpg", type: "image", w: 2480, h: 3508, name: "knight", tag: "", alt: "" },
    { file: "Mad Max - Car.jpg", type: "image", w: 1920, h: 1080, name: "Mad Max — perseguição", tag: "Composição · key art", alt: "" },
    { file: "Remnants of the Frozen Country.jpg", type: "image", w: 6000, h: 4000, name: "Remnants of the Frozen Country", tag: "", alt: "" },
    { file: "Snow landscape.jpg", type: "image", w: 4961, h: 3135, name: "Snow landscape", tag: "", alt: "" },
    { file: "Valley Knight.jpg", type: "image", w: 4466, h: 2580, name: "Valley Knight", tag: "", alt: "" }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
