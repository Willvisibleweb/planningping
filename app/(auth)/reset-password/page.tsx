import ResetPasswordForm from './ResetPasswordForm'

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Reset password</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Enter your email and we'll send you a reset link.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  )
}
