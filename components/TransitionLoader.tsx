'use client'

import { motion } from 'framer-motion'
import CircularText from './CircularText'

interface TransitionLoaderProps {
  message?: string
  progress?: number
  showProgress?: boolean
}

export default function TransitionLoader({ 
  message = "Loading...", 
  progress = 0,
  showProgress = false 
}: TransitionLoaderProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center z-50"
    >
      <div className="text-center">
        {/* Animated be-visible text */}
        <motion.div 
          className="mb-8"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <CircularText
            text="BE*VISIBLE*AI*"
            onHover="speedUp"
            spinDuration={6}
            className="text-blue-600"
          />
        </motion.div>
        
        {/* Loading message */}
        <motion.div 
          className="space-y-4"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <h2 className="text-xl font-semibold text-gray-800">
            {message}
          </h2>
          
          {/* Progress bar */}
          {showProgress && (
            <div className="w-64 mx-auto">
              <div className="bg-gray-200 rounded-full h-2">
                <motion.div 
                  className="bg-blue-600 h-2 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">{progress}%</p>
            </div>
          )}
          
          {/* Simple loading dots */}
          {!showProgress && (
            <div className="flex justify-center space-x-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 bg-blue-600 rounded-full"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5]
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}
