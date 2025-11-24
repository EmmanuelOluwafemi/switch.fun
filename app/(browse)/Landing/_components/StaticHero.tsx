import { HeroButton } from "./hero-button";

export function StaticHero() {
  return (
    <>
      {/* Content positioned over the video */}
      <div className="absolute bg-gradient-to-t from-black via-black/80 to-transparent inset-0 flex flex-col justify-end p-4 pb-6 md:p-8 z-10">
        <div className="max-w-2xl">
          <h3 className="text-2xl md:text-5xl lg:text-6xl text-white mb-4 font-bold font-sans text-center md:text-left">
            Livestream And Get Fan Rewards
          </h3>
          <p className="text-sm md:text-xl text-white/80 mb-6 text-center md:text-left">
            Gaming, coding, live events, and creative content — all powered by the
            Blockchain.
          </p>
          <div className="flex flex-wrap gap-4 justify-center md:justify-start">
            <HeroButton />
          </div>
        </div>
      </div>
    </>
  );
} 