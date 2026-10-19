export default function MessagingSettings() { return null; }
export const getServerSideProps = async () => ({ redirect: { destination: "/dashboard/admin?tab=messaging-settings", permanent: false } });
