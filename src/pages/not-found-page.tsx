import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom"
import { Button } from "@/components/ui/button"

export default function NotFoundPage() {
  const error = useRouteError()
  const notFound = !error || (isRouteErrorResponse(error) && error.status === 404)
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="flex w-full max-w-xl flex-col items-center space-y-4 px-8 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{notFound ? "404 – Not found" : "Something went wrong"}</h1>
        <p className="text-muted-foreground">
          {notFound ? "This isn't the page you're looking for." : error instanceof Error ? error.message : "An unexpected error occurred."}
        </p>
        <Button variant="outline" asChild>
          <Link to="/">Back to overview</Link>
        </Button>
      </div>
    </div>
  )
}
