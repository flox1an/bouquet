type ImageSize = {
  width: number;
  height: number;
};

export const getImageSize = async (imageFile: File): Promise<ImageSize> => {
  const img = new Image();
  const objectUrl = URL.createObjectURL(imageFile);
  const promise = new Promise<ImageSize>((resolve, reject) => {
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => reject();
  });
  img.src = objectUrl;
  return promise;
};
