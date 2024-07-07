import { decode } from 'blurhash';
import { useEffect, useRef } from 'react';

type BlurhashImageProps = {
  blurhash: string;
  width: number;
  height: number;
  alt: string;
};

export function BlurhashImage({ blurhash, width, height, ...props }: BlurhashImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');

      const pixels = decode(blurhash, width, height);
      if (ctx) {
        const imageData = ctx.createImageData(width, height);
        imageData.data.set(pixels);
        ctx.putImageData(imageData, 0, 0);
      }
    }
  }, [blurhash, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} {...props} />;
}
