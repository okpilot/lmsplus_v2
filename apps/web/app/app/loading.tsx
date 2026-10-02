import { Shimmer } from '@/components/kit/shimmer'

export default function AppLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading</span>
      <Shimmer className="h-8 w-56" />
      <Shimmer className="h-32 w-full" />
      <Shimmer className="h-32 w-full" />
      <Shimmer className="h-32 w-full" />
    </div>
  )
}
