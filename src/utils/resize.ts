async function compress(
  file: File,
  { quality = 0.95, maxWidth, maxHeight }: { quality: number; maxWidth?: number; maxHeight?: number }
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async function () {
      const source = {
        width: img.naturalWidth,
        height: img.naturalHeight,
      };

      const target = {
        width: maxWidth || source.width,
        height: maxHeight || source.height,
      };
      const aspectRatio = Math.min(1, target.width / source.width, target.height / source.height);
      target.width = source.width * aspectRatio;
      target.height = source.height * aspectRatio;

      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext('2d') as CanvasRenderingContext2D;
      context?.drawImage(img, 0, 0, target.width, target.height);

      canvas.toBlob(
        blob => {
          if (blob == null) {
            reject('Could not convert image.');
            return;
          }

          const newFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now(),
          });

          resolve(newFile);
        },
        file.type,
        quality
      );
    };

    img.src = URL.createObjectURL(file);
  });
}

export async function resizeImage(input: File, width?: number, height?: number): Promise<File> {
  const result = await compress(input, {
    quality: 0.95,
    maxWidth: width,
    maxHeight: height,
  });

  return result;
}
