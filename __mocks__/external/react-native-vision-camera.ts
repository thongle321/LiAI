const mock = {
  Camera: {},
  useCameraDevice: () => null,
  useCameraPermission: () => ({ hasPermission: true, requestPermission: async () => true }),
};

export default mock;
export { mock };