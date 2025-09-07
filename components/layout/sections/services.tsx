import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

enum ProService {
  YES = 1,
  NO = 0,
}
interface ServiceProps {
  title: string;
  pro: ProService;
  description: string;
}
const serviceList: ServiceProps[] = [
  {
    title: "Analista de asimetrias faciales",
    description:
      "Ojo, ceja y sonrisa con la cámara.",
    pro: 0,
  },
  {
    title: "Coach virtual AI",
    description:
      "Líneas guía y ejercicios en 2d para ejecutar mejor con ejemplos visuales",
    pro: 0,
  },
  {
    title: "Integraciones & seguridad",
    description: "Para doctores y organizaciones",
    pro: 0,
  },
  {
    title: "Care Kit",
    description: "Asistente sobre cuidados segun la hora del dia, lubricacion y evaluacion ocular",
    pro: 1,
  },
];

export const ServicesSection = () => {
  return (
    <section id="services" className="container py-24 sm:py-32">
      <h2 className="text-lg text-primary text-center mb-2 tracking-wider">
        Servicios
      </h2>

      <h2 className="text-3xl md:text-4xl text-center font-bold mb-4">
       Se parte 
      </h2>
      <h3 className="md:w-1/2 mx-auto text-xl text-center text-muted-foreground mb-8">
        conoce nuestros lanzamientos futuros
      </h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-4 w-full lg:w-[60%] mx-auto">
        {serviceList.map(({ title, description, pro }) => (
          <Card
            key={title}
            className="bg-muted/60 dark:bg-card h-full relative"
          >
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <Badge
              data-pro={ProService.YES === pro}
              variant="secondary"
              className="absolute -top-2 -right-3 data-[pro=false]:hidden"
            >
              PRO
            </Badge>
          </Card>
        ))}
      </div>
    </section>
  );
};
