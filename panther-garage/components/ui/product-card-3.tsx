"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card"; // shadcn Card components
import { Button } from "./button"; // shadcn Button component
import { ArrowRight, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

// Define the type for a single drop item
export interface DropItem {
  time: string;
  name: string;
  collection: string;
  imageSrc?: string;
  price?: string;
  href?: string;
  addable?: boolean;
}

// Define the props for the main component
export interface ProductDropCardProps {
  title: string;
  subtitle: string;
  items: DropItem[];
  onAdd?: (index: number) => void;
  addLabel?: string;
}

export const ProductDropCard = ({
  title,
  subtitle,
  items,
  onAdd,
  addLabel = "Add",
}: ProductDropCardProps) => {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const itemsToShow = 3; // Number of items visible at once

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < items.length - itemsToShow;

  const handlePrev = () => {
    if (canGoPrev) {
      setCurrentIndex((prevIndex) => prevIndex - 1);
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      setCurrentIndex((prevIndex) => prevIndex + 1);
    }
  };

  return (
    <Card className="w-full overflow-hidden border-white/10 bg-gradient-to-br from-white/[.06] via-transparent to-transparent backdrop-blur-xl">
      <CardHeader className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate text-xl font-bold tracking-tight md:text-2xl">
              {title}
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              {subtitle}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrev}
              disabled={!canGoPrev}
              aria-label="Previous drop"
              className="rounded-full border-white/15 bg-white/[.03] text-foreground backdrop-blur transition-colors hover:border-lime/40 hover:bg-lime/10 hover:text-lime disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              disabled={!canGoNext}
              aria-label="Next drop"
              className="rounded-full border-white/15 bg-white/[.03] text-foreground backdrop-blur transition-colors hover:border-lime/40 hover:bg-lime/10 hover:text-lime disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-hidden px-4 pb-4">
        {/* Carousel container with smooth transition */}
        <div
          className="flex gap-4 transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * (100 / itemsToShow)}%)` }}
        >
          {items.map((item, index) => {
            const body = (
              <>
                <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/10 bg-white/[.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                  {item.time}
                </span>
                <div className="relative aspect-[5/2] w-full overflow-hidden rounded-xl bg-gradient-to-br from-white/[.07] to-transparent ring-1 ring-inset ring-white/[.06]">
                  {item.imageSrc ? (
                    <img
                      src={item.imageSrc}
                      alt={item.name}
                      className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-[1.05]"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center">
                      <ImageIcon className="h-8 w-8 text-white/15" />
                    </div>
                  )}
                </div>
                <div>
                  <h3
                    className="truncate font-semibold leading-snug transition-colors group-hover:text-lime"
                    title={item.name}
                  >
                    {item.name}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.collection}
                  </p>
                </div>
              </>
            );

            const card = (
              <div className="group flex h-full flex-col gap-2 rounded-2xl border border-white/[.08] bg-card p-3 text-card-foreground transition-all duration-300 hover:-translate-y-1 hover:border-lime/40 hover:shadow-[0_22px_44px_-26px_rgba(199,243,107,.4)]">
                {item.href ? (
                  <Link href={item.href} className="flex flex-1 flex-col gap-2">
                    {body}
                  </Link>
                ) : (
                  <div className="flex flex-1 flex-col gap-2">{body}</div>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <p className="text-base font-bold text-lime">
                    {item.price || (item.href ? "View details" : "")}
                  </p>
                  {onAdd ? (
                    <button
                      type="button"
                      onClick={() => onAdd(index)}
                      disabled={item.addable === false}
                      aria-label={`${addLabel} ${item.name}`}
                      className="inline-flex items-center gap-1 rounded-full bg-lime px-3 py-1.5 text-[11px] font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      {addLabel}
                    </button>
                  ) : item.href ? (
                    <Link href={item.href} aria-label={`View ${item.name}`}>
                      <ArrowRight className="h-4 w-4 shrink-0 text-lime opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </Link>
                  ) : null}
                </div>
              </div>
            );

            return (
              <div
                key={index}
                className="flex-shrink-0 w-full"
                style={{
                  flexBasis: `calc((100% / ${itemsToShow}) - (${
                    (itemsToShow - 1) * 16
                  }px / ${itemsToShow}))`,
                }}
              >
                {card}
              </div>
            );
          })}
        </div>

        {/* Progress indicator */}
        {items.length > itemsToShow ? (
          <div className="mt-5 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[.08]">
              <div
                className="h-full rounded-full bg-lime transition-all duration-500"
                style={{
                  width: `${((currentIndex + itemsToShow) / items.length) * 100}%`,
                }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {currentIndex + 1}
              {"\u2013"}
              {Math.min(currentIndex + itemsToShow, items.length)} / {items.length}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default ProductDropCard;
