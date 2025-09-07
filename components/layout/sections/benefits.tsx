import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { icons } from "lucide-react";

interface BenefitsProps {
  icon: string;
  title: string;
  description: string;
}

const benefitList: BenefitsProps[] = [
  {
    icon: "Blocks",
    title: "Evaluación inicial",
    description:
      "mide tres movimientos con la cámara o un autorreporte simple..",
  },
  {
    icon: "LineChart",
    title: " Rutina diaria (12 min)",
    description:
      "ejercicios guiados, pausas y contador automático.",
  },
  {
    icon: "Wallet",
    title: "Seguimiento",
    description:
      "recordatorios, rachas semanales y alertas si hay fatiga o dolor.",
  },
  {
    icon: "Sparkle",
    title: "Acompañamiento",
    description:
      "comparte un video breve y recibe comentarios de un profesional aliado.",
  },
];

export const BenefitsSection = () => {
  return (
    <section id="benefits" className="container py-24 sm:py-32">
      <div className="grid lg:grid-cols-2 place-items-center lg:gap-24">
        <div>
          <h2 className="text-lg text-primary mb-2 tracking-wider">Paralisis Facial Parcial</h2>

          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            ¿Por qué cuesta mantenerse constante?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            La parálisis facial parcial afecta funciones cotidianas como parpadear, sonreír o comer. La terapia ayuda, pero es difícil medir avances y sostener una rutina.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 w-full">
          {benefitList.map(({ icon, title, description }, index) => (
            <Card
              key={title}
              className="bg-muted/50 dark:bg-card hover:bg-background transition-all delay-75 group/number"
            >
              <CardHeader>
                <div className="flex justify-between">
                  <Icon
                    name={icon as keyof typeof icons}
                    size={32}
                    color="hsl(var(--primary))"
                    className="mb-6 text-primary"
                  />
                  <span className="text-5xl text-muted-foreground/15 font-medium transition-all delay-75 group-hover/number:text-muted-foreground/30">
                    0{index + 1}
                  </span>
                </div>

                <CardTitle>{title}</CardTitle>
              </CardHeader>

              <CardContent className="text-muted-foreground">
                {description}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
