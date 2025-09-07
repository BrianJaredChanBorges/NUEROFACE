import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check } from "lucide-react";

enum PopularPlan {
  NO = 0,
  YES = 1,
}

interface PlanProps {
  title: string;
  popular: PopularPlan;
  price: number;
  description: string;
  buttonText: string;
  benefitList: string[];
}

const plans: PlanProps[] = [
  {
    title: "Gratis",
    popular: 0,
    price: 0,
    description:
      "Si tienes preguntas, este es el primer paso",
    buttonText: "Dame mi accesso",
    benefitList: [
      "1 usuario",
      "Evaluación",
      "primer micro-plan",
      "Acceso a nuestra comunidad",
      "Asistencia Remota",
    ],
  },
  {
    title: "Care+",
    popular: 1,
    price: 350,
    description:
      "Toma el Control de tu progreso",
    buttonText: "Lo quiero",
    benefitList: [
      "4 Usuarios",
      "Sesiones guiadas",
      "Mirror Coach",
      "Reportes mensuales",
      "mas todo lo de el plan gratuito",
    ],
  },
  {
    title: "Enterprise",
    popular: 0,
    price: 500,
    description:
      "Equipa tu consultorio",
    buttonText: "contactanos",
    benefitList: [
      "BlinkGuard",
      "Acceso a bolsa de trabajo",
      "Posicionamiento de tu clinica",
      "Soporte por email o telefono",
      "Acceso a metricas faciales impulsadas por IA",
      "CRM para el control de pacientes",
    ],
  },
];

export const PricingSection = () => {
  return (
    <section className="container py-24 sm:py-32">
      <h2 className="text-lg text-primary text-center mb-2 tracking-wider">
        Precios
      </h2>

      <h2 className="text-3xl md:text-4xl text-center font-bold mb-4">
        Obten acceso ilimitado
      </h2>

      <h3 className="md:w-1/2 mx-auto text-xl text-center text-muted-foreground pb-14">
        si cumples el 80%  de tu programa y no hay mejora, te damos 2 semanas Pro sin costo.
      </h3>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-4">
        {plans.map(
          ({ title, popular, price, description, buttonText, benefitList }) => (
            <Card
              key={title}
              className={
                popular === PopularPlan?.YES
                  ? "drop-shadow-xl shadow-black/10 dark:shadow-white/10 border-[1.5px] border-primary lg:scale-[1.1]"
                  : ""
              }
            >
              <CardHeader>
                <CardTitle className="pb-2">{title}</CardTitle>

                <CardDescription className="pb-4">
                  {description}
                </CardDescription>

                <div>
                  <span className="text-3xl font-bold">${price}</span>
                  <span className="text-muted-foreground"> /month</span>
                </div>
              </CardHeader>

              <CardContent className="flex">
                <div className="space-y-4">
                  {benefitList.map((benefit) => (
                    <span key={benefit} className="flex">
                      <Check className="text-primary mr-2" />
                      <h3>{benefit}</h3>
                    </span>
                  ))}
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  variant={
                    popular === PopularPlan?.YES ? "default" : "secondary"
                  }
                  className="w-full"
                >
                  {buttonText}
                </Button>
              </CardFooter>
            </Card>
          )
        )}
      </div>
    </section>
  );
};
