// Keep existing bookmarks working after merging health controls into devices.
export default function DeviceHealthRedirect() {
  return null;
}

export const getServerSideProps = async () => ({
  redirect: { destination: "/dashboard/phone", permanent: false },
});
