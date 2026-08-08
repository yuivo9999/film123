import { CinemaExperience } from "../../CinemaExperience";
import { auditoriums, getAuditoriumById } from "../../cinema-data";

export function generateStaticParams() {
  const ids = new Set(auditoriums.map((a) => a.id));
  ids.add("cnfm-imax");
  ids.add("auditorium-1");
  return Array.from(ids).map((id) => ({
    auditoriumId: id,
  }));
}

export default async function CinemaPage({
  params,
}: {
  params: Promise<{ auditoriumId: string }>;
}) {
  const { auditoriumId } = await params;
  let auditorium = getAuditoriumById(auditoriumId);

  if (!auditorium) {
    auditorium = auditoriums[0];
  }

  return <CinemaExperience initialAuditoriumId={auditorium.id} />;
}
