import { useEffect, useRef, type VideoHTMLAttributes } from 'react';

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & {
  src: string;
};

export function ViewportVideo({ src, ...props }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let visible = false;

    const update = () => {
      if (visible && document.visibilityState === 'visible') {
        if (!video.getAttribute('src')) {
          video.src = src;
        }
        void video.play().catch(() => {
          // El usuario puede iniciar el video con los controles.
        });
      } else {
        video.pause();
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      visible = true;
      update();
    }

    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          entries => {
            const entry = entries[0];
            visible = !!entry &&
              entry.isIntersecting &&
              entry.intersectionRatio >= 0.25;
            update();
          },
          { threshold: [0, 0.25, 0.5] }
        );

    observer?.observe(video);
    document.addEventListener('visibilitychange', update);

    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  return (
    <video
      {...props}
      ref={videoRef}
      muted
      playsInline
      preload="none"
      controls
    />
  );
}
