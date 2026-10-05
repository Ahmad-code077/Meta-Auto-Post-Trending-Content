'use client'

import { useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createApplicationFromJobDescription } from '@/app/actions/applications'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const MIN_LENGTH = 50
const MAX_LENGTH = 5000

const formSchema = z.object({
    jobDescription: z
        .string()
        .trim()
        .min(MIN_LENGTH, `Add at least ${MIN_LENGTH} characters`)
        .max(MAX_LENGTH, `Keep it under ${MAX_LENGTH} characters`),
})

type FormValues = z.infer<typeof formSchema>

export default function NewApplicationPage() {
    const { toast } = useToast()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const { control, handleSubmit, reset, register, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { jobDescription: '' },
    })

    const description = useWatch({ control, name: 'jobDescription', defaultValue: '' })
    const remaining = MIN_LENGTH - description.trim().length

    const onSubmit = (values: FormValues) => {
        startTransition(async () => {
            const result = await createApplicationFromJobDescription(values.jobDescription)

            if (!result.success) {
                toast({ title: 'Could not save', description: result.message, variant: 'destructive' })
                return
            }

            toast({
                title: result.data?.draftCreated ? 'Draft ready for review' : 'Application saved',
                description: result.data?.message,
                variant: result.data?.draftCreated ? 'default' : 'destructive',
            })
            reset({ jobDescription: '' })
            router.push('/dashboard/job-posts')
        })
    }

    return (
        <div className="mx-auto max-w-3xl">
            <Card>
                <CardHeader>
                    <CardTitle>New application</CardTitle>
                    <CardDescription>
                        Paste the job posting. It is analyzed against your profile and a draft email is prepared for you to review. Nothing is sent until you send it.
                    </CardDescription>
                </CardHeader>

                <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    <CardContent className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="jobDescription">Job posting</Label>
                            <span className={cn('text-xs tabular-nums', remaining > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground')}>
                                {remaining > 0 ? `${remaining} more to go` : `${description.length} / ${MAX_LENGTH}`}
                            </span>
                        </div>
                        <Textarea
                            id="jobDescription"
                            rows={14}
                            placeholder="Paste the full job post, including the recruiter contact if it is there."
                            aria-invalid={!!errors.jobDescription}
                            aria-describedby={errors.jobDescription ? 'jobDescription-error' : undefined}
                            className="resize-y"
                            {...register('jobDescription')}
                        />
                        {errors.jobDescription && (
                            <p id="jobDescription-error" className="text-sm text-destructive">
                                {errors.jobDescription.message}
                            </p>
                        )}
                    </CardContent>

                    <CardFooter className="justify-between gap-3 border-t pt-6">
                        <Button variant="outline" asChild>
                            <Link href="/dashboard/job-posts">Cancel</Link>
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="animate-spin" />}
                            {isPending ? 'Analyzing' : 'Analyze and draft'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
