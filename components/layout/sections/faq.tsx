import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQProps {
  question: string;
  answer: string;
  value: string;
}

const FAQList: FAQProps[] = [
  {
    question: "¿Necesito equipo especial?",
    answer: "No para empezar; trabajas con tu cámara y guía paso a paso.",
    value: "item-1",
  },
  {
    question: "¿Qué pasa si me duele?",
    answer:
      "La app te pedirá bajar intensidad o posponer y respeta un tope diario de seguridad.",
    value: "item-2",
  },
  {
    question:
      "¿Puedo compartir mis avances?",
    answer:
      "Sí, descargas un PDF con tus métricas para tu terapeuta.",
    value: "item-3",
  },
  {
    question: "¿Es un tratamiento médico?",
    answer: "Es apoyo guiado y educativo; no reemplaza consulta médica.",
    value: "item-4",
  },
  {
    question:
      "A quien puedo acudir si tengo paralisis facial?",
    answer: "No te preocupes nosotros agendamos una cita por tu y hacemos la valoracion medica con un especialista de nuestro equipos",
    value: "item-5",
  },
];

export const FAQSection = () => {
  return (
    <section id="faq" className="container md:w-[700px] py-24 sm:py-32">
      <div className="text-center mb-8">
        <h2 className="text-lg text-primary text-center mb-2 tracking-wider">
          FAQS
        </h2>

        <h2 className="text-3xl md:text-4xl text-center font-bold">
         Preguntas Comunes
        </h2>
      </div>

      <Accordion type="single" collapsible className="AccordionRoot">
        {FAQList.map(({ question, answer, value }) => (
          <AccordionItem key={value} value={value}>
            <AccordionTrigger className="text-left">
              {question}
            </AccordionTrigger>

            <AccordionContent>{answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
};
