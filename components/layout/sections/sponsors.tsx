"use client";

import { Icon } from "@/components/ui/icon";
import Marquee from "@/components/ui/marquee";
 
import { icons } from "lucide-react";
interface sponsorsProps {
  icon: string;
  name: string;
}

const sponsors: sponsorsProps[] = [
  {
    icon: "Crown",
    name: "IT CANCUN",
  },
  {
    icon: "Vegan",
    name:"INSTITUTO TECNOLOGICO DE CANCUN",
  },
  {
    icon: "Ghost",
    name: "INNOVATEC",
  },
  {
    icon: "Puzzle",
    name: "TECNM CANCUN",
  },
  {
    icon: "Squirrel",
    name: "TUCAN CANCUN",
  },
  {
    icon: "Cookie",
    name: "TECNOLOGICO DE CANCUN",
  },
  {
    icon: "Drama",
    name: "CERTAMEN DE PROYECTOS INNOVATEC",
  },
];

export const SponsorsSection = () => {
  return (
    <section id="sponsors" className="max-w-[75%] mx-auto pb-24 sm:pb-32">
      <h2 className="text-lg md:text-xl text-center mb-6">
        NUESROS PATROCINADORES ESPECIALES
      </h2>

      <div className="mx-auto">
        <Marquee
          className="gap-[3rem]"
          fade
          innerClassName="gap-[3rem]"
          pauseOnHover
        >
          {sponsors.map(({ icon, name }) => (
            <div
              key={name}
              className="flex items-center text-xl md:text-2xl font-medium"
            >
              <Icon
                name={icon as keyof typeof icons}
                size={32}
                color="white"
                className="mr-2"
              />
              {name}
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
};
