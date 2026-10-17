function readWithFileReader(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener(
      "loadend",
      () => resolve(new Uint8Array(reader.result as ArrayBuffer)),
      { once: true }
    );
    reader.readAsArrayBuffer(blob);
  });
}

export async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return typeof blob.arrayBuffer === "function"
    ? new Uint8Array(await blob.arrayBuffer())
    : readWithFileReader(blob);
}
