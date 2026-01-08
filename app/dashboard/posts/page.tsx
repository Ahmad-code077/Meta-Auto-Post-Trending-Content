// app/page.tsx
"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";

// Define validation schema
const formSchema = z.object({
    jobDescription: z
        .string()
        .min(1, "Job description is required")
        .min(50, "Job description must be at least 50 characters")
        .max(5000, "Job description must be less than 5000 characters"),
    action: z.enum(["send", "save"]),
});

type FormData = z.infer<typeof formSchema>;

const Page = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<{
        type: "success" | "error" | null;
        message: string;
    }>({ type: null, message: "" });

    const {
        register,
        handleSubmit,
        formState: { errors },
        watch,
        setValue,
    } = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            jobDescription: "",
            action: "send",
        },
    });

    const actionValue = watch("action");

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setSubmitStatus({ type: null, message: "" });

        try {
            const payload = {
                jobDescription: data.jobDescription,
                action: data.action,
                timestamp: new Date().toISOString(),
                metadata: {
                    characterCount: data.jobDescription.length,
                    wordCount: data.jobDescription.split(/\s+/).filter(Boolean).length,
                },
            };

            const response = await fetch(
                "https://my-automation-4j0i.onrender.com/webhook/send-email-to-n8n",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            setSubmitStatus({
                type: "success",
                message: `Successfully ${data.action === "send" ? "sent" : "saved as draft"}! Webhook responded successfully.`,
            });

            // Reset form after successful submission if sent
            if (data.action === "send") {
                setValue("jobDescription", "");
            }
        } catch (error) {
            console.error("Error submitting form:", error);
            setSubmitStatus({
                type: "error",
                message: `Failed to ${actionValue === "send" ? "send" : "save"}. Please try again.`,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-linear-to-r from-background to-muted p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <Card className="shadow-lg border">
                    <CardHeader className="bg-linear-to-r from-accent to-primary/10 rounded-t-lg">
                        <CardTitle className="text-2xl md:text-3xl font-bold">
                            Job Description Processor
                        </CardTitle>
                        <CardDescription>
                            Paste your job description below and choose an action. Data will be sent to the webhook for processing.
                        </CardDescription>
                    </CardHeader>

                    <form onSubmit={handleSubmit(onSubmit)}>
                        <CardContent className="space-y-6 pt-6">
                            {/* Action Selection */}
                            <div className="space-y-4">
                                <Label className="text-lg font-semibold">Action</Label>
                                <RadioGroup
                                    value={actionValue}
                                    onValueChange={(value: "send" | "save") =>
                                        setValue("action", value)
                                    }
                                    className="flex flex-col md:flex-row gap-4"
                                >
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="send" id="send" />
                                        <Label
                                            htmlFor="send"
                                            className="flex items-center gap-2 cursor-pointer"
                                        >
                                            <Send className="h-4 w-4" />
                                            Send Immediately
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="save" id="save" />
                                        <Label
                                            htmlFor="save"
                                            className="flex items-center gap-2 cursor-pointer"
                                        >
                                            <Save className="h-4 w-4" />
                                            Save as Draft
                                        </Label>
                                    </div>
                                </RadioGroup>
                                {errors.action && (
                                    <p className="text-sm text-destructive">{errors.action.message}</p>
                                )}
                            </div>

                            {/* Job Description Textarea */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <Label htmlFor="jobDescription" className="text-lg font-semibold">
                                        Job Description
                                    </Label>
                                    <span className="text-sm text-muted-foreground">
                                        {watch("jobDescription").length}/5000 characters
                                    </span>
                                </div>
                                <div className="relative">
                                    <Textarea
                                        id="jobDescription"
                                        placeholder="Paste your job description here... (Minimum 50 characters)"
                                        className={`min-h-[300px] resize-y text-base p-4 ${errors.jobDescription
                                            ? "border-destructive focus-visible:ring-destructive"
                                            : ""
                                            }`}
                                        {...register("jobDescription")}
                                    />
                                    {watch("jobDescription").length < 50 && (
                                        <div className="absolute bottom-2 right-2 text-xs text-amber-600">
                                            {50 - watch("jobDescription").length} more characters needed
                                        </div>
                                    )}
                                </div>
                                {errors.jobDescription && (
                                    <p className="text-sm text-destructive">
                                        {errors.jobDescription.message}
                                    </p>
                                )}
                            </div>


                            {/* Status Messages */}
                            {submitStatus.type && (
                                <Alert
                                    variant={
                                        submitStatus.type === "success" ? "default" : "destructive"
                                    }
                                >
                                    {submitStatus.type === "success" ? (
                                        <CheckCircle className="h-4 w-4" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4" />
                                    )}
                                    <AlertTitle className="capitalize">
                                        {submitStatus.type}
                                    </AlertTitle>
                                    <AlertDescription>{submitStatus.message}</AlertDescription>
                                </Alert>
                            )}
                        </CardContent>

                        <CardFooter className="flex justify-between border-t bg-accent/10 px-6 py-4">
                            <div className="text-sm text-muted-foreground">
                                <p>
                                    Action:{" "}
                                    <span className="font-semibold">
                                        {actionValue === "send" ? "Send Immediately" : "Save as Draft"}
                                    </span>
                                </p>
                                <p className="mt-1">
                                    Characters: {watch("jobDescription").length} | Words:{" "}
                                    {watch("jobDescription").split(/\s+/).filter(Boolean).length}
                                </p>
                            </div>
                            <Button
                                type="submit"
                                disabled={isSubmitting || !!errors.jobDescription}
                                className="min-w-[120px]"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Processing...
                                    </>
                                ) : actionValue === "send" ? (
                                    <>
                                        <Send className="mr-2 h-4 w-4" />
                                        Send Now
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Save Draft
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* Instructions */}
                <Card className="mt-6 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">How to Use</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                        <p>1. Paste your job description in the text area above</p>
                        <p>2. Choose between &quot;Send Immediately&quot; or &quot;Save as Draft&quot;</p>
                        <p>3. Click the submit button to send data to the webhook</p>
                        <p>4. Check the status message for confirmation</p>
                    </CardContent>
                </Card>
            </div>
        </div >
    );
};

export default Page;